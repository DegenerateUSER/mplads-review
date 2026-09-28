/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
