export interface MonitoredForm {
  key: string;
  selector: string;
  id?: string;
  name?: string;
  action?: string;
  method?: string;
  fieldCount: number;
}

export interface MonitoredRoute {
  href: string;
  path: string;
  search: string;
  hash: string;
}

export type PageMonitorEvent =
  | { type: 'forms-added'; forms: MonitoredForm[] }
  | { type: 'forms-removed'; forms: MonitoredForm[] }
  | { type: 'route-changed'; from: MonitoredRoute; to: MonitoredRoute };

export interface PageMonitorSnapshot {
  route: MonitoredRoute;
  forms: MonitoredForm[];
  version: number;
  lastEvents: PageMonitorEvent[];
}
