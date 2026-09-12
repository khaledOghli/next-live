/**
 * Types for the demo vendor workspace package. A real third-party package
 * ships its own; this exists only so the playground typechecks.
 */
declare module '@demo/vendor' {
  export const name: string;
  export const version: string;
}
declare module '@demo/vendor/Widget' {
  export default class Widget {
    constructor(props?: { label?: string });
    label: string;
  }
}
declare module '@demo/vendor/heavy' {
  export const rows: Array<{ id: number; label: string; value: number; tags: string[] }>;
  export const count: number;
}
