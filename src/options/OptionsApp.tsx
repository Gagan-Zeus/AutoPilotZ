import { useEffect, useState } from 'react';
import { useOptionsStore } from './store';

export function OptionsApp() {
  const { settings, status, loading, load, save } = useOptionsStore();
  const [allowedOriginsText, setAllowedOriginsText] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setAllowedOriginsText(settings.allowedOrigins.join('\n'));
  }, [settings.allowedOrigins]);

  return (
    <main className="min-h-screen bg-panel text-ink">
      <section className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold">AutoPilotX Options</h1>
            <p className="mt-1 text-sm text-slate-600">{status}</p>
          </div>
          <button
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading}
            onClick={() =>
              void save({
                allowedOrigins: allowedOriginsText
                  .split('\n')
                  .map((origin) => origin.trim())
                  .filter(Boolean),
              })
            }
          >
            Save
          </button>
        </div>

        <div className="space-y-6">
          <label className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium">AI mapping engine</span>
              <span className="text-xs text-slate-600">Enable local heuristic field mapping.</span>
            </span>
            <input
              type="checkbox"
              checked={settings.aiMappingEnabled}
              onChange={(event) => void save({ aiMappingEnabled: event.target.checked })}
            />
          </label>

          <label className="block rounded border border-slate-200 bg-white px-4 py-3">
            <span className="block text-sm font-medium">Minimum confidence</span>
            <input
              className="mt-3 w-full accent-teal-700"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.minConfidence}
              onChange={(event) => void save({ minConfidence: Number(event.target.value) })}
            />
            <span className="mt-1 block text-xs text-slate-600">
              {Math.round(settings.minConfidence * 100)}%
            </span>
          </label>

          <label className="block rounded border border-slate-200 bg-white px-4 py-3">
            <span className="block text-sm font-medium">Allowed origins</span>
            <textarea
              className="mt-3 h-40 w-full resize-none rounded border border-slate-300 px-3 py-2 font-mono text-sm"
              value={allowedOriginsText}
              onChange={(event) => setAllowedOriginsText(event.target.value)}
              placeholder="https://example.com"
            />
          </label>
        </div>
      </section>
    </main>
  );
}
