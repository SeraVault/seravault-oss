# Backend Service Architecture

This directory contains the backend abstraction layer for the application.

## Core Components

- **`BackendInterface.ts`**: Defines the contract that any backend implementation must satisfy. It includes interfaces for `User`, `UserProfile`, `FileRecord`, etc.
- **`BackendService.ts`**: The main service used by the application. It wraps the active backend implementation and provides a consistent API.
- **`FirebaseBackend.ts`**: The Firebase implementation of `BackendInterface`.
- **`SupabaseBackend.ts`**: The Supabase implementation of `BackendInterface` (currently a stub).

## Switching Backends

The backend is selected at build time using the `VITE_BACKEND_TYPE` environment variable. This allows for tree-shaking unused backend libraries.

1.  Open your `.env` file.
2.  Set `VITE_BACKEND_TYPE` to either `firebase` or `supabase`.
    ```env
    VITE_BACKEND_TYPE=firebase
    ```
3.  Restart your development server or run the build command.

The build system (Vite) uses an alias `@backend-provider` to resolve to the correct file.

## TypeScript Configuration

The `tsconfig.app.json` is configured to point `@backend-provider` to `FirebaseBackend.ts` by default for IDE support.

```json
"paths": {
  "@backend-provider": ["./src/backend/FirebaseBackend.ts"]
}
```

If you are working primarily with Supabase, you may want to update this path in `tsconfig.app.json` locally to get correct type inference for that specific implementation, although both should satisfy `BackendInterface`.

## Adding a New Backend

1. Create a new class implementing `BackendInterface`.
2. Implement all required methods.
3. Instantiate it and export it as `backend`.
    ```typescript
    export const myBackend = new MyBackend();
    export const backend = myBackend;
    ```
4. Update `vite.config.ts` to include your new type in the `backendFile` logic.

## Migration Status

See `BACKEND_MODULARITY_REPORT.md` in the project root for details on the migration status and remaining tasks for Supabase integration.