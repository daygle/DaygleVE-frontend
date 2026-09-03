// Minimal ambient types for the parts of noVNC's RFB client we use. The
// package ships no types; this declares just the constructor, the one property
// and the events the console viewer relies on.
declare module "@novnc/novnc" {
  export default class RFB {
    constructor(
      target: HTMLElement | undefined,
      url: string,
      options?: Record<string, unknown>,
    );
    /** Scale the remote framebuffer to fit its container. */
    scaleViewport: boolean;
    /** Cleanly close the connection. */
    disconnect(): void;
    addEventListener(type: string, listener: (e: CustomEvent) => void): void;
  }
}
