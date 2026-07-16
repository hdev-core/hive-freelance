/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type KeychainResponse = {
  success: boolean;
  result?: string;
  message?: string;
};

interface Window {
  hive_keychain?: {
    requestHandshake: (cb: () => void) => void;
    requestSignBuffer: (
      username: string,
      message: string,
      keyType: string,
      cb: (response: KeychainResponse) => void,
    ) => void;
    requestBroadcast: (
      username: string,
      operations: [string, Record<string, unknown>][],
      keyType: string,
      cb: (response: KeychainResponse) => void,
    ) => void;
  };
}
