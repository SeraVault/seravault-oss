/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build timestamp injected by Vite
declare const __BUILD_TIMESTAMP__: string;

declare module '@backend-provider' {
  import { BackendInterface } from './backend/BackendInterface';
  export const backend: BackendInterface;
}
