export type KeyringEntry = {
  getPassword(): string;
  setPassword(value: string): void;
  deletePassword(): void;
};
export type KeyringConstructor = new (
  service: string,
  account: string,
  options?: unknown,
) => KeyringEntry;
export async function loadKeyring(): Promise<KeyringConstructor> {
  const name = '@napi-rs/keyring';
  const module = await import(name);
  if (typeof module.Entry !== 'function') throw new Error('Native keyring does not export Entry.');
  return module.Entry as KeyringConstructor;
}
