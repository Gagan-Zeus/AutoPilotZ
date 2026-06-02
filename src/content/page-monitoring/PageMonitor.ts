import type {
  MonitoredForm,
  MonitoredRoute,
  PageMonitorEvent,
  PageMonitorSnapshot,
} from '../../core/entities/PageMonitoring';

export interface PageMonitorOptions {
  debounceMs: number;
  maxTrackedEvents: number;
}

const defaultOptions: PageMonitorOptions = {
  debounceMs: 50,
  maxTrackedEvents: 50,
};

const formFieldSelector = 'input,select,textarea,[contenteditable]:not([contenteditable="false"])';

export class PageMonitor {
  private observer?: MutationObserver;
  private originalPushState?: History['pushState'];
  private originalReplaceState?: History['replaceState'];
  private flushTimer?: number;
  private currentRoute: MonitoredRoute;
  private version = 0;
  private readonly formKeys = new WeakMap<HTMLFormElement, string>();
  private readonly currentForms = new Map<string, MonitoredForm>();
  private readonly pendingAddedForms = new Map<string, MonitoredForm>();
  private readonly pendingRemovedForms = new Map<string, MonitoredForm>();
  private readonly lastEvents: PageMonitorEvent[] = [];
  private readonly listeners = new Set<(events: PageMonitorEvent[]) => void>();
  private readonly options: PageMonitorOptions;

  constructor(
    private readonly rootDocument: Document = document,
    options: Partial<PageMonitorOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
    this.currentRoute = this.readRoute();
  }

  start(listener?: (events: PageMonitorEvent[]) => void): () => void {
    this.stop();
    if (listener) {
      this.listeners.add(listener);
    }

    this.currentRoute = this.readRoute();
    this.currentForms.clear();
    for (const form of this.collectForms(this.rootDocument.documentElement)) {
      this.currentForms.set(form.key, form);
    }

    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(this.rootDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['id', 'name', 'action', 'method'],
    });
    this.patchHistory();
    this.rootDocument.defaultView?.addEventListener('popstate', this.handleRouteEvent);
    this.rootDocument.defaultView?.addEventListener('hashchange', this.handleRouteEvent);

    return () => {
      if (listener) {
        this.listeners.delete(listener);
      }
      this.stop();
    };
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.clearFlushTimer();
    this.restoreHistory();
    this.rootDocument.defaultView?.removeEventListener('popstate', this.handleRouteEvent);
    this.rootDocument.defaultView?.removeEventListener('hashchange', this.handleRouteEvent);
    this.pendingAddedForms.clear();
    this.pendingRemovedForms.clear();
    this.listeners.clear();
  }

  on(listener: (events: PageMonitorEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): PageMonitorSnapshot {
    return {
      route: this.currentRoute,
      forms: [...this.currentForms.values()],
      version: this.version,
      lastEvents: [...this.lastEvents],
    };
  }

  private handleMutations(mutations: MutationRecord[]): void {
    let routeMayHaveChanged = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        this.trackAddedNodes(mutation.addedNodes);
        this.trackRemovedNodes(mutation.removedNodes);
        routeMayHaveChanged =
          routeMayHaveChanged || this.nodeListCouldAffectRoute(mutation.addedNodes);
      } else if (mutation.type === 'attributes' && mutation.target instanceof HTMLFormElement) {
        this.trackUpdatedForm(mutation.target);
      }
    }

    if (routeMayHaveChanged) {
      this.detectRouteChange();
    }

    this.scheduleFlush();
  }

  private trackAddedNodes(nodes: NodeList): void {
    for (const node of Array.from(nodes)) {
      if (!(node instanceof Element)) {
        continue;
      }
      for (const form of this.collectForms(node)) {
        this.currentForms.set(form.key, form);
        this.pendingRemovedForms.delete(form.key);
        this.pendingAddedForms.set(form.key, form);
      }
    }
  }

  private trackRemovedNodes(nodes: NodeList): void {
    for (const node of Array.from(nodes)) {
      if (!(node instanceof Element)) {
        continue;
      }
      for (const form of this.collectForms(node)) {
        const existing = this.currentForms.get(form.key) ?? form;
        this.currentForms.delete(form.key);
        this.pendingAddedForms.delete(form.key);
        this.pendingRemovedForms.set(form.key, existing);
      }
    }
  }

  private trackUpdatedForm(form: HTMLFormElement): void {
    const descriptor = this.describeForm(form);
    this.currentForms.set(descriptor.key, descriptor);
  }

  private collectForms(root: ParentNode | Element): MonitoredForm[] {
    const forms: HTMLFormElement[] = [];
    if (root instanceof HTMLFormElement) {
      forms.push(root);
    }
    if (root instanceof Element && !this.subtreeMayContainForm(root)) {
      return forms.map((form) => this.describeForm(form));
    }
    forms.push(...Array.from(root.querySelectorAll?.<HTMLFormElement>('form') ?? []));
    return forms.map((form) => this.describeForm(form));
  }

  private subtreeMayContainForm(element: Element): boolean {
    return element.matches('form') || Boolean(element.querySelector('form'));
  }

  private describeForm(form: HTMLFormElement): MonitoredForm {
    return {
      key: this.formKey(form),
      selector: this.stableSelector(form),
      id: form.id || undefined,
      name: form.getAttribute('name') ?? undefined,
      action: form.getAttribute('action') ?? undefined,
      method: form.getAttribute('method') ?? undefined,
      fieldCount: form.querySelectorAll(formFieldSelector).length,
    };
  }

  private formKey(form: HTMLFormElement): string {
    const existing = this.formKeys.get(form);
    if (existing) {
      return existing;
    }

    const key =
      form.id ||
      form.getAttribute('name') ||
      form.getAttribute('data-testid') ||
      `${this.stableSelector(form)}:${this.currentForms.size + 1}`;
    this.formKeys.set(form, key);
    return key;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) {
      return;
    }

    this.flushTimer = this.rootDocument.defaultView?.setTimeout(
      () => this.flush(),
      this.options.debounceMs,
    );
  }

  private flush(): void {
    this.clearFlushTimer();
    const events: PageMonitorEvent[] = [];
    const added = [...this.pendingAddedForms.values()];
    const removed = [...this.pendingRemovedForms.values()];
    this.pendingAddedForms.clear();
    this.pendingRemovedForms.clear();

    if (added.length > 0) {
      events.push({ type: 'forms-added', forms: added });
    }
    if (removed.length > 0) {
      events.push({ type: 'forms-removed', forms: removed });
    }

    this.emit(events);
  }

  private emit(events: PageMonitorEvent[]): void {
    if (events.length === 0) {
      return;
    }

    this.version += 1;
    this.lastEvents.push(...events);
    this.lastEvents.splice(0, Math.max(0, this.lastEvents.length - this.options.maxTrackedEvents));
    for (const listener of this.listeners) {
      listener(events);
    }
  }

  private patchHistory(): void {
    const view = this.rootDocument.defaultView;
    if (!view || this.originalPushState || this.originalReplaceState) {
      return;
    }

    const history = view.history;
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);
    const notify = () => {
      view.setTimeout(() => this.detectRouteChange(), 0);
    };

    history.pushState = ((...args: Parameters<History['pushState']>) => {
      this.originalPushState?.(...args);
      notify();
    }) as History['pushState'];
    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState?.(...args);
      notify();
    }) as History['replaceState'];
  }

  private restoreHistory(): void {
    const view = this.rootDocument.defaultView;
    if (!view) {
      return;
    }

    if (this.originalPushState) {
      view.history.pushState = this.originalPushState;
      this.originalPushState = undefined;
    }
    if (this.originalReplaceState) {
      view.history.replaceState = this.originalReplaceState;
      this.originalReplaceState = undefined;
    }
  }

  private handleRouteEvent = (): void => {
    this.detectRouteChange();
  };

  private detectRouteChange(): void {
    const nextRoute = this.readRoute();
    if (nextRoute.href === this.currentRoute.href) {
      return;
    }

    const previousRoute = this.currentRoute;
    this.currentRoute = nextRoute;
    this.emit([{ type: 'route-changed', from: previousRoute, to: nextRoute }]);
  }

  private readRoute(): MonitoredRoute {
    const location = this.rootDocument.location;
    return {
      href: location.href,
      path: location.pathname,
      search: location.search,
      hash: location.hash,
    };
  }

  private nodeListCouldAffectRoute(nodes: NodeList): boolean {
    return Array.from(nodes).some(
      (node) =>
        node instanceof Element &&
        (node.matches('main,[data-router],[data-route],title') ||
          Boolean(node.querySelector('main,[data-router],[data-route],title'))),
    );
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== undefined) {
      this.rootDocument.defaultView?.clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private stableSelector(element: Element): string {
    if (element.id) {
      return `#${this.escapeCss(element.id)}`;
    }

    const name = element.getAttribute('name');
    if (name) {
      return `${element.tagName.toLowerCase()}[name="${this.escapeCss(name)}"]`;
    }

    const segments: string[] = [];
    let current: Element | null = element;
    while (current && current !== this.rootDocument.body) {
      const parent: Element | null = current.parentElement;
      if (!parent) {
        break;
      }
      const tagName = current.tagName;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === tagName);
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
      current = parent;
    }

    return segments.join(' > ');
  }

  private escapeCss(value: string): string {
    return this.rootDocument.defaultView?.CSS?.escape
      ? this.rootDocument.defaultView.CSS.escape(value)
      : value.replace(/["\\#.:,[\]>+~*^$|= ]/g, '\\$&');
  }
}
