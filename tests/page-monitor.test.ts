/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageMonitorEvent } from '../src/core/entities/PageMonitoring';
import { PageMonitor } from '../src/content/page-monitoring/PageMonitor';

const flushMonitor = async (ms = 25): Promise<void> => {
  await Promise.resolve();
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
};

describe('PageMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/start');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects new forms with a batched MutationObserver flush', async () => {
    const monitor = new PageMonitor(document, { debounceMs: 10 });
    const events: PageMonitorEvent[][] = [];
    const stop = monitor.start((batch) => events.push(batch));

    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <form id="apply"><input name="email" /></form>
        <form name="profile"><textarea name="summary"></textarea></form>
      `,
    );
    await flushMonitor(10);
    stop();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual([
      {
        type: 'forms-added',
        forms: [
          expect.objectContaining({ id: 'apply', fieldCount: 1 }),
          expect.objectContaining({ name: 'profile', fieldCount: 1 }),
        ],
      },
    ]);
    expect(monitor.snapshot().forms).toHaveLength(2);
  });

  it('detects removed forms', async () => {
    document.body.innerHTML = `<form id="removeMe"><input name="email" /></form>`;
    const monitor = new PageMonitor(document, { debounceMs: 10 });
    const events: PageMonitorEvent[][] = [];
    const stop = monitor.start((batch) => events.push(batch));

    document.querySelector('#removeMe')?.remove();
    await flushMonitor(10);
    stop();

    expect(events).toEqual([
      [
        {
          type: 'forms-removed',
          forms: [expect.objectContaining({ id: 'removeMe', fieldCount: 1 })],
        },
      ],
    ]);
    expect(monitor.snapshot().forms).toHaveLength(0);
  });

  it('detects SPA navigation through pushState and replaceState', async () => {
    const monitor = new PageMonitor(document, { debounceMs: 10 });
    const events: PageMonitorEvent[][] = [];
    const stop = monitor.start((batch) => events.push(batch));

    window.history.pushState({}, '', '/jobs/123');
    await flushMonitor(10);
    window.history.replaceState({}, '', '/jobs/123/edit?step=1');
    await flushMonitor(10);
    stop();

    const routeEvents = events.flat().filter((event) => event.type === 'route-changed');
    expect(routeEvents).toHaveLength(2);
    const firstRouteEvent = routeEvents[0];
    const secondRouteEvent = routeEvents[1];
    if (firstRouteEvent?.type !== 'route-changed' || secondRouteEvent?.type !== 'route-changed') {
      throw new Error('Expected route change events.');
    }
    expect(firstRouteEvent.from.path).toBe('/start');
    expect(firstRouteEvent.to.path).toBe('/jobs/123');
    expect(secondRouteEvent.from.path).toBe('/jobs/123');
    expect(secondRouteEvent.to.path).toBe('/jobs/123/edit');
    expect(secondRouteEvent.to.search).toBe('?step=1');
    expect(monitor.snapshot().route.path).toBe('/jobs/123/edit');
  });

  it('detects hash route changes', async () => {
    const monitor = new PageMonitor(document, { debounceMs: 10 });
    const events: PageMonitorEvent[][] = [];
    const stop = monitor.start((batch) => events.push(batch));

    window.location.hash = '#profile';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushMonitor(10);
    stop();

    const routeEvent = events.flat()[0];
    if (routeEvent?.type !== 'route-changed') {
      throw new Error('Expected a route change event.');
    }
    expect(routeEvent.to.hash).toBe('#profile');
  });

  it('coalesces rapid form additions into one added event', async () => {
    const monitor = new PageMonitor(document, { debounceMs: 10 });
    const events: PageMonitorEvent[][] = [];
    const stop = monitor.start((batch) => events.push(batch));

    document.body.insertAdjacentHTML('beforeend', '<form id="one"></form>');
    document.body.insertAdjacentHTML('beforeend', '<form id="two"></form>');
    document.body.insertAdjacentHTML('beforeend', '<form id="three"></form>');
    await flushMonitor(10);
    stop();

    expect(events).toHaveLength(1);
    const addedEvent = events[0]?.[0];
    if (addedEvent?.type !== 'forms-added') {
      throw new Error('Expected a forms-added event.');
    }
    expect(addedEvent.forms.map((form) => form.id)).toEqual(['one', 'two', 'three']);
  });
});
